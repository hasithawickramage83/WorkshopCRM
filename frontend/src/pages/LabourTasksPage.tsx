import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { jobsApi, labourTasksApi } from '../lib/api';
import { Employee, JOB_SUB_TASK_TYPES, formatStatus, formatSubTaskType } from '../lib/types';

const JOB_PAGE_SIZE = 10;

interface JobHit {
  id: string;
  jobNumber: string;
  status: string;
  description?: string | null;
  customer?: { name?: string; phone?: string } | null;
  vehicle?: { registrationNo?: string; make?: string; model?: string } | null;
}

interface SavedTask {
  id: string;
  taskType: string;
  otherLabel?: string | null;
  description: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes: number;
}

interface JobGroup {
  job: JobHit;
  totalMinutes: number;
  tasks: SavedTask[];
}

interface DraftTask {
  key: string;
  taskType: string;
  otherLabel: string;
  description: string;
  startTime: string;
  endTime: string;
}

function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyDraft(): DraftTask {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    taskType: 'PAINTING',
    otherLabel: '',
    description: '',
    startTime: '',
    endTime: '',
  };
}

function formatClock(value?: string | null) {
  return value && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : '';
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(Math.max(0, totalMinutes) / 60);
  const minutes = Math.max(0, totalMinutes) % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  if (minutes) return `${minutes}m`;
  return '0m';
}

function formatTaskName(task: { taskType: string; otherLabel?: string | null }) {
  if (task.taskType === 'OTHER' && task.otherLabel?.trim()) return task.otherLabel.trim();
  return formatSubTaskType(task.taskType);
}

function formatTaskTime(task: SavedTask) {
  const start = formatClock(task.startTime);
  const end = formatClock(task.endTime);
  if (start && end) return `${start} – ${end} (${formatDuration(task.durationMinutes)})`;
  return formatDuration(task.durationMinutes);
}

function jobLabel(job: JobHit) {
  const vehicle = [job.vehicle?.registrationNo, job.vehicle?.make, job.vehicle?.model].filter(Boolean).join(' · ');
  return {
    title: job.jobNumber,
    customer: job.customer?.name || '—',
    vehicle: vehicle || '—',
  };
}

export default function LabourTasksPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [labourLocked, setLabourLocked] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState(todayInput());
  const [groups, setGroups] = useState<JobGroup[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [jobPage, setJobPage] = useState(1);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobTotalPages, setJobTotalPages] = useState(1);
  const [hits, setHits] = useState<JobHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ job: JobHit; drafts: DraftTask[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<{
    id: string;
    taskType: string;
    otherLabel: string;
    description: string;
    startTime: string;
    endTime: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    labourTasksApi.labours()
      .then((res) => {
        const list = (res.data.data.employees || []).filter((e: Employee) => e.isActive !== false);
        setLabourLocked(!!res.data.data.locked);
        setEmployees(list);
        if (list.length) setEmployeeId(list[0].id);
      })
      .catch(() => setError('Failed to load labour list'));
  }, []);

  const loadRecorded = useCallback(async () => {
    if (!employeeId || !workDate) {
      setGroups([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await labourTasksApi.list({ employeeId, workDate });
      setGroups(res.data.data.jobs || []);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to load recorded tasks');
    } finally {
      setLoading(false);
    }
  }, [employeeId, workDate]);

  useEffect(() => {
    loadRecorded();
  }, [loadRecorded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setJobPage(1);
  }, [search]);

  useEffect(() => {
    setSearching(true);
    const params: Record<string, string> = {
      page: String(jobPage),
      limit: String(JOB_PAGE_SIZE),
    };
    if (search) {
      params.search = search;
    } else {
      params.status = 'ACTIVE';
    }
    jobsApi.list(params)
      .then((res) => {
        const data = res.data.data;
        const jobs = data.jobs || [];
        const total = data.total ?? jobs.length;
        const limit = data.limit || JOB_PAGE_SIZE;
        setHits(jobs);
        setJobTotal(total);
        setJobTotalPages(Math.max(1, Math.ceil(total / limit)));
      })
      .catch(() => {
        setHits([]);
        setJobTotal(0);
        setJobTotalPages(1);
      })
      .finally(() => setSearching(false));
  }, [search, jobPage]);

  const pickJob = (job: JobHit) => {
    setPicked((current) => {
      const existing = current.find((row) => row.job.id === job.id);
      if (existing) {
        return current.map((row) => (
          row.job.id === job.id ? { ...row, drafts: [...row.drafts, emptyDraft()] } : row
        ));
      }
      return [...current, { job, drafts: [emptyDraft()] }];
    });
    setSearchInput('');
    setSearch('');
    setJobPage(1);
  };

  const updateDraft = (jobId: string, key: string, patch: Partial<DraftTask>) => {
    setPicked((current) => current.map((row) => (
      row.job.id !== jobId ? row : {
        ...row,
        drafts: row.drafts.map((task) => (task.key === key ? { ...task, ...patch } : task)),
      }
    )));
  };

  const addDraft = (jobId: string) => {
    setPicked((current) => current.map((row) => (
      row.job.id !== jobId ? row : { ...row, drafts: [...row.drafts, emptyDraft()] }
    )));
  };

  const removeDraft = (jobId: string, key: string) => {
    setPicked((current) => current.map((row) => (
      row.job.id !== jobId ? row : {
        ...row,
        drafts: row.drafts.length === 1 ? row.drafts : row.drafts.filter((task) => task.key !== key),
      }
    )));
  };

  const removePicked = (jobId: string) => {
    setPicked((current) => current.filter((row) => row.job.id !== jobId));
  };

  const saveJobTasks = async (event: FormEvent, jobId: string) => {
    event.preventDefault();
    const card = picked.find((row) => row.job.id === jobId);
    if (!card || !employeeId) return;
    const tasks = card.drafts.map((task) => ({
      taskType: task.taskType,
      otherLabel: task.taskType === 'OTHER' ? task.otherLabel.trim() : '',
      description: task.description.trim(),
      startTime: task.startTime,
      endTime: task.endTime,
    })).filter((task) => (
      task.startTime
      && task.endTime
      && (task.taskType !== 'OTHER' || task.otherLabel)
    ));

    if (!tasks.length) {
      setError('Add at least one task with start and end time. If the task is Other, specify it.');
      return;
    }

    setSavingJobId(jobId);
    setError('');
    try {
      await labourTasksApi.createBatch({ employeeId, jobId, workDate, tasks });
      setToast('Tasks saved. You can add more for this job.');
      setPicked((current) => current.map((row) => (
        row.job.id === jobId ? { ...row, drafts: [emptyDraft()] } : row
      )));
      await loadRecorded();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to save tasks');
    } finally {
      setSavingJobId(null);
    }
  };

  const startEditTask = (task: SavedTask) => {
    setEditingTask({
      id: task.id,
      taskType: task.taskType,
      otherLabel: task.otherLabel || '',
      description: task.description || '',
      startTime: formatClock(task.startTime),
      endTime: formatClock(task.endTime),
    });
  };

  const saveEditedTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTask) return;
    setSavingEdit(true);
    setError('');
    try {
      await labourTasksApi.update(editingTask.id, {
        taskType: editingTask.taskType,
        otherLabel: editingTask.taskType === 'OTHER' ? editingTask.otherLabel.trim() : '',
        description: editingTask.description.trim(),
        startTime: editingTask.startTime,
        endTime: editingTask.endTime,
      });
      setToast('Task updated');
      setEditingTask(null);
      await loadRecorded();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to update task');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await labourTasksApi.delete(id);
      if (editingTask?.id === id) setEditingTask(null);
      await loadRecorded();
    } catch {
      setError('Failed to delete task');
    }
  };

  const pickedIds = useMemo(() => new Set(picked.map((row) => row.job.id)), [picked]);
  const labourName = employees.find((e) => e.id === employeeId)?.name || 'Labour';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Labour tasks</h1>
        <p className="text-sm text-gray-500">
          Pick a labour, choose a job, then record tasks with start and end time. The same job can have more than one task.
        </p>
      </div>

      {toast && <div className="bg-green-50 text-green-800 border border-green-200 rounded-lg px-4 py-2 text-sm">{toast}</div>}
      {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{error}</div>}

      <div className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Labour *</label>
            <select
              className="input"
              value={employeeId}
              disabled={labourLocked && employees.length <= 1}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              {employees.length === 0 && (
                <option value="">
                  {labourLocked ? 'No labour record linked to this login' : 'No active labour'}
                </option>
              )}
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}{e.employeeCode ? ` (${e.employeeCode})` : ''}
                </option>
              ))}
            </select>
            {labourLocked && employees.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Ask an admin to link this login to an employee on the Employees page.
              </p>
            )}
          </div>
          <div>
            <label className="label">Work date *</label>
            <input type="date" className="input" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Jobs</label>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="input pl-9"
              placeholder="Search any job, including completed or closed..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="border rounded-lg overflow-hidden">
            {searching && hits.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">Loading jobs...</p>
            ) : hits.length === 0 ? (
              <p className="p-3 text-sm text-gray-400">No jobs found</p>
            ) : hits.map((job) => {
              const label = jobLabel(job);
              const selected = pickedIds.has(job.id);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => pickJob(job)}
                  className={`w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 ${selected ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex justify-between gap-3">
                    <p className="font-mono font-semibold">{label.title}</p>
                    <p className="text-xs text-gray-500">{formatStatus(job.status)}</p>
                  </div>
                  <p className="text-sm text-gray-600">{label.customer} · {label.vehicle}</p>
                </button>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-gray-50">
              <p className="text-xs text-gray-500">
                Page {jobPage} of {jobTotalPages} · {jobTotal} jobs
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40"
                  disabled={jobPage <= 1 || searching}
                  onClick={() => setJobPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm flex items-center gap-1 disabled:opacity-40"
                  disabled={jobPage >= jobTotalPages || searching}
                  onClick={() => setJobPage((p) => Math.min(jobTotalPages, p + 1))}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {picked.map((card) => {
        const label = jobLabel(card.job);
        return (
          <form key={card.job.id} onSubmit={(e) => saveJobTasks(e, card.job.id)} className="card space-y-4">
            <div className="flex justify-between gap-3 items-start">
              <div>
                <h2 className="font-semibold text-lg font-mono">{label.title}</h2>
                <p className="text-sm text-gray-500">{label.customer} · {label.vehicle}</p>
                {card.job.description && <p className="text-sm text-gray-600 mt-1">{card.job.description}</p>}
              </div>
              <button type="button" className="p-1 hover:bg-gray-100 rounded" onClick={() => removePicked(card.job.id)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {card.drafts.map((task, index) => (
              <div key={task.key} className="border rounded-lg p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold">Task {index + 1}</p>
                  {card.drafts.length > 1 && (
                    <button type="button" className="text-sm text-red-600" onClick={() => removeDraft(card.job.id, task.key)}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="label">Task</label>
                    <select
                      className="input"
                      value={task.taskType}
                      onChange={(e) => updateDraft(card.job.id, task.key, {
                        taskType: e.target.value,
                        otherLabel: e.target.value === 'OTHER' ? task.otherLabel : '',
                      })}
                    >
                      {JOB_SUB_TASK_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  {task.taskType === 'OTHER' && (
                    <div className="md:col-span-3">
                      <label className="label">Specify other *</label>
                      <input
                        className="input"
                        required
                        placeholder="e.g. Masking, buffing..."
                        value={task.otherLabel}
                        onChange={(e) => updateDraft(card.job.id, task.key, { otherLabel: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="md:col-span-4">
                    <label className="label">Description</label>
                    <input
                      className="input"
                      placeholder="Optional notes about this task"
                      value={task.description}
                      onChange={(e) => updateDraft(card.job.id, task.key, { description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Start time *</label>
                    <input
                      type="time"
                      required
                      className="input"
                      value={task.startTime}
                      onChange={(e) => updateDraft(card.job.id, task.key, { startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">End time *</label>
                    <input
                      type="time"
                      required
                      className="input"
                      value={task.endTime}
                      onChange={(e) => updateDraft(card.job.id, task.key, { endTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => addDraft(card.job.id)}>
                <Plus className="w-4 h-4" /> Add task
              </button>
              <button type="submit" className="btn-primary" disabled={savingJobId === card.job.id}>
                {savingJobId === card.job.id ? 'Saving...' : 'Save tasks'}
              </button>
            </div>
          </form>
        );
      })}

      <div className="card space-y-4">
        <h2 className="font-semibold text-lg">Recorded for {labourName}</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks recorded for this labour and date.</p>
        ) : groups.map((group) => {
          const label = jobLabel(group.job);
          return (
            <div key={group.job.id} className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 flex justify-between gap-3 items-start">
                <div>
                  <p className="font-mono font-semibold">{label.title}</p>
                  <p className="text-sm text-gray-500">{label.customer} · {label.vehicle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{formatDuration(group.totalMinutes)}</p>
                  <button
                    type="button"
                    className="btn-secondary text-xs flex items-center gap-1"
                    onClick={() => pickJob(group.job)}
                  >
                    <Plus className="w-3 h-3" /> Add task
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-left p-2">Task</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Time</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map((task) => (
                    <tr key={task.id} className="border-t">
                      {editingTask?.id === task.id ? (
                        <td colSpan={4} className="p-2">
                          <form onSubmit={saveEditedTask} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <select
                              className="input"
                              value={editingTask.taskType}
                              onChange={(e) => setEditingTask({
                                ...editingTask,
                                taskType: e.target.value,
                                otherLabel: e.target.value === 'OTHER' ? editingTask.otherLabel : '',
                              })}
                            >
                              {JOB_SUB_TASK_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            {editingTask.taskType === 'OTHER' && (
                              <input
                                className="input md:col-span-3"
                                required
                                placeholder="Specify other task"
                                value={editingTask.otherLabel}
                                onChange={(e) => setEditingTask({ ...editingTask, otherLabel: e.target.value })}
                              />
                            )}
                            <input
                              className="input md:col-span-4"
                              placeholder="Optional description"
                              value={editingTask.description}
                              onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                            />
                            <input
                              type="time"
                              required
                              className="input"
                              value={editingTask.startTime}
                              onChange={(e) => setEditingTask({ ...editingTask, startTime: e.target.value })}
                            />
                            <input
                              type="time"
                              required
                              className="input"
                              value={editingTask.endTime}
                              onChange={(e) => setEditingTask({ ...editingTask, endTime: e.target.value })}
                            />
                            <div className="md:col-span-2 flex gap-2">
                              <button type="submit" className="btn-primary" disabled={savingEdit}>
                                {savingEdit ? 'Saving...' : 'Save'}
                              </button>
                              <button type="button" className="btn-secondary" onClick={() => setEditingTask(null)}>
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      ) : (
                        <>
                          <td className="p-2">{formatTaskName(task)}</td>
                          <td className="p-2">{task.description}</td>
                          <td className="p-2 font-medium">{formatTaskTime(task)}</td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button type="button" className="p-1 text-brand-600 hover:bg-blue-50 rounded" onClick={() => startEditTask(task)}>
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button type="button" className="p-1 text-red-600 hover:bg-red-50 rounded" onClick={() => deleteTask(task.id)}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
