import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Save, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { labourHoursApi } from '../lib/api';
import {
  LabourHoursWeek,
  formatCurrency,
  formatDate,
} from '../lib/types';

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function num(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function splitHours(decimalHours: number) {
  const totalMinutes = Math.round(Math.max(0, decimalHours) * 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function combineHours(hoursStr: string, minutesStr: string) {
  const hours = Math.max(0, num(hoursStr));
  const minutes = Math.max(0, Math.min(59, Math.round(num(minutesStr))));
  return Math.round((hours + minutes / 60) * 100) / 100;
}

function parsedTime(hoursStr: string, minutesStr: string) {
  return {
    hours: Math.max(0, num(hoursStr)),
    minutes: Math.max(0, Math.min(59, Math.round(num(minutesStr)))),
  };
}

function formatDuration(decimalHours: number) {
  if (decimalHours <= 0) return '—';
  const { hours, minutes } = splitHours(decimalHours);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

interface RowState {
  employeeId: string;
  entryId: string | null;
  name: string;
  employeeCode: string;
  jobTitle: string | null;
  isActive: boolean;
  workedDays: string;
  hours: string;
  minutes: string;
  hourlyRate: string;
  notes: string;
}

function rowsFromWeek(data: LabourHoursWeek): RowState[] {
  const byEmployee = new Map(data.entries.map((entry) => [entry.employeeId, entry]));
  return data.employees.map((employee) => {
    const entry = byEmployee.get(employee.id);
    const parts = entry ? splitHours(entry.hours) : { hours: 0, minutes: 0 };
    return {
      employeeId: employee.id,
      entryId: entry?.id || null,
      name: employee.name,
      employeeCode: employee.employeeCode,
      jobTitle: employee.jobTitle || null,
      isActive: employee.isActive !== false,
      workedDays: entry?.workedDays ? String(entry.workedDays) : '',
      hours: entry ? String(parts.hours) : '',
      minutes: entry && parts.minutes ? String(parts.minutes) : (entry ? '0' : ''),
      hourlyRate: entry
        ? String(entry.hourlyRate)
        : (employee.hourlyRate != null ? String(employee.hourlyRate) : ''),
      notes: entry?.notes || '',
    };
  });
}

export default function LabourHoursPage() {
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const load = (start?: string) => {
    setLoading(true);
    setError('');
    labourHoursApi.getWeek(start)
      .then((res) => {
        const data = res.data.data as LabourHoursWeek;
        setWeekStart(data.weekStart);
        setWeekEnd(data.weekEnd);
        setRows(rowsFromWeek(data));
      })
      .catch(() => setError('Failed to load labour hours'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const rowTotals = useMemo(() => {
    return rows.map((row) => {
      const hours = combineHours(row.hours, row.minutes);
      const rate = num(row.hourlyRate);
      return {
        ...row,
        decimalHours: hours,
        amount: Math.round(hours * rate * 100) / 100,
      };
    });
  }, [rows]);

  const workedRows = useMemo(
    () => rowTotals.filter((row) => row.decimalHours > 0 || num(row.workedDays) > 0),
    [rowTotals],
  );

  const totals = useMemo(() => {
    return rowTotals.reduce(
      (acc, row) => {
        acc.days += num(row.workedDays);
        acc.hours += row.decimalHours;
        acc.amount += row.amount;
        return acc;
      },
      { days: 0, hours: 0, amount: 0 },
    );
  }, [rowTotals]);

  const updateRow = (employeeId: string, patch: Partial<RowState>) => {
    setRows((current) => current.map((row) => (
      row.employeeId === employeeId ? { ...row, ...patch } : row
    )));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!weekStart) return;
    setError('');
    setSaving(true);
    try {
      const res = await labourHoursApi.saveWeek({
        weekStart,
        rows: rows.map((row) => {
          const time = parsedTime(row.hours, row.minutes);
          return {
            employeeId: row.employeeId,
            workedDays: row.workedDays.trim() === '' ? 0 : Math.round(num(row.workedDays)),
            hours: time.hours,
            minutes: time.minutes,
            hourlyRate: row.hourlyRate.trim() === '' ? null : num(row.hourlyRate),
            notes: row.notes.trim() || null,
          };
        }),
      });
      const data = res.data.data as LabourHoursWeek;
      setWeekStart(data.weekStart);
      setWeekEnd(data.weekEnd);
      setRows(rowsFromWeek(data));
      setToast('Labour hours and rates saved');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save labour hours');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (row: RowState) => {
    if (!row.entryId) {
      updateRow(row.employeeId, { hours: '', minutes: '', workedDays: '', notes: '' });
      return;
    }
    if (!confirm(`Clear hours for ${row.name} this week?`)) return;
    try {
      await labourHoursApi.delete(row.entryId);
      updateRow(row.employeeId, { entryId: null, hours: '', minutes: '', workedDays: '', notes: '' });
      setToast(`Cleared hours for ${row.name}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to clear hours');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Labour hours</h1>
          <p className="text-gray-500">Record weekly working days, hours and minutes, and hourly rates. Saved hours become a labour payable in Finance.</p>
        </div>
        <button type="submit" form="labour-hours-form" className="btn-primary inline-flex items-center gap-2" disabled={saving || loading || rows.length === 0}>
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save week'}
        </button>
      </div>

      {(toast || error) && (
        <div className={`rounded-lg px-4 py-2 text-sm ${error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {error || toast}
        </div>
      )}

      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary px-3" disabled={!weekStart || loading} onClick={() => load(shiftDate(weekStart, -7))} title="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            className="input w-auto"
            value={weekStart}
            onChange={(e) => { if (e.target.value) load(e.target.value); }}
          />
          <button type="button" className="btn-secondary px-3" disabled={!weekStart || loading} onClick={() => load(shiftDate(weekStart, 7))} title="Next week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {weekStart && weekEnd ? `Week · ${formatDate(weekStart)} – ${formatDate(weekEnd)}` : 'Loading week...'}
        </p>
      </div>

      {!loading && (
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold">Weekly totals by labour</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Hours and allocated amount (hours × rate) for {weekStart && weekEnd ? `${formatDate(weekStart)} – ${formatDate(weekEnd)}` : 'this week'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-indigo-50 px-3 py-2">
              <p className="text-xs text-indigo-700">Working days</p>
              <p className="font-semibold text-indigo-900">{totals.days}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 px-3 py-2">
              <p className="text-xs text-indigo-700">Total labour hours</p>
              <p className="font-semibold text-indigo-900">{formatDuration(totals.hours)}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 px-3 py-2">
              <p className="text-xs text-indigo-700">Total allocated</p>
              <p className="font-semibold text-indigo-900">{formatCurrency(totals.amount)}</p>
            </div>
          </div>
          {workedRows.length === 0 ? (
            <p className="text-sm text-gray-400">No hours entered for this week yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left p-3">Labour</th>
                    <th className="text-right p-3">Days</th>
                    <th className="text-right p-3">Hours</th>
                    <th className="text-right p-3">Allocated</th>
                  </tr>
                </thead>
                <tbody>
                  {workedRows.map((row) => (
                    <tr key={row.employeeId} className="border-t">
                      <td className="p-3">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs font-mono text-gray-500">{row.employeeCode}</div>
                      </td>
                      <td className="p-3 text-right">{num(row.workedDays) || '—'}</td>
                      <td className="p-3 text-right font-medium">{formatDuration(row.decimalHours)}</td>
                      <td className="p-3 text-right font-semibold">{row.amount > 0 ? formatCurrency(row.amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50 font-medium">
                    <td className="p-3">Week total</td>
                    <td className="p-3 text-right">{totals.days}</td>
                    <td className="p-3 text-right">{formatDuration(totals.hours)}</td>
                    <td className="p-3 text-right">{formatCurrency(totals.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      <form id="labour-hours-form" onSubmit={handleSubmit} className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">Labour</th>
              <th className="text-left p-3">Job title</th>
              <th className="text-left p-3 w-28">Worked days</th>
              <th className="text-left p-3 w-24">Hours</th>
              <th className="text-left p-3 w-24">Minutes</th>
              <th className="text-left p-3 w-32">Hourly rate</th>
              <th className="text-left p-3">Amount</th>
              <th className="text-left p-3">Notes</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-gray-400">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-400">
                  No employees yet. Register labours on the{' '}
                  <Link to="/employees" className="text-brand-600 hover:underline">Employees</Link> page first.
                </td>
              </tr>
            ) : rows.map((row) => {
              const amount = combineHours(row.hours, row.minutes) * num(row.hourlyRate);
              return (
                <tr key={row.employeeId} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs font-mono text-gray-500">{row.employeeCode}</div>
                    {!row.isActive && <div className="text-xs text-amber-700">Inactive</div>}
                  </td>
                  <td className="p-3">{row.jobTitle || '—'}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      max="7"
                      step="1"
                      className="input"
                      value={row.workedDays}
                      onChange={(e) => updateRow(row.employeeId, { workedDays: e.target.value })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      max="168"
                      step="1"
                      className="input"
                      placeholder="0"
                      value={row.hours}
                      onChange={(e) => updateRow(row.employeeId, { hours: e.target.value })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      className="input"
                      placeholder="0"
                      value={row.minutes}
                      onChange={(e) => updateRow(row.employeeId, { minutes: e.target.value })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      step="0.01"
                      className="input"
                      value={row.hourlyRate}
                      onChange={(e) => updateRow(row.employeeId, { hourlyRate: e.target.value })}
                    />
                  </td>
                  <td className="p-3 font-medium">{amount > 0 ? formatCurrency(amount) : '—'}</td>
                  <td className="p-3">
                    <input
                      className="input"
                      value={row.notes}
                      onChange={(e) => updateRow(row.employeeId, { notes: e.target.value })}
                      placeholder="Optional"
                    />
                  </td>
                  <td className="p-3">
                    {(row.entryId || row.hours || row.minutes || row.workedDays) && (
                      <button type="button" className="text-red-600 hover:text-red-800 inline-flex" onClick={() => handleClear(row)} title="Clear hours">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && !loading && (
            <tfoot>
              <tr className="border-t bg-gray-50 font-medium">
                <td className="p-3" colSpan={2}>Week total</td>
                <td className="p-3">{totals.days}</td>
                <td className="p-3" colSpan={2}>{formatDuration(totals.hours)}</td>
                <td className="p-3" />
                <td className="p-3">{formatCurrency(totals.amount)}</td>
                <td className="p-3" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </form>
    </div>
  );
}
