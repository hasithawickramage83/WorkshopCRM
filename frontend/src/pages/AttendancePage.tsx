import { useCallback, useEffect, useState } from 'react';
import { Clock, MapPin, Loader2, Coffee, LogOut, AlertTriangle } from 'lucide-react';
import { attendanceApi } from '../lib/api';
import { formatDate } from '../lib/types';

type AttendanceStatus = 'NOT_STARTED' | 'WORKING' | 'ON_BREAK' | 'FINISHED';

interface AttendanceState {
  status: AttendanceStatus;
  workDate: string;
  today: {
    workMinutes: number;
    breakMinutes: number;
    workHours: number;
    workFormatted: string;
    breakFormatted: string;
  };
  events: Array<{
    id: string;
    eventType: 'CLOCK_IN' | 'CLOCK_OUT';
    eventAt: string;
    clockOutReason?: 'BREAK' | 'END_OF_DAY' | null;
    withinGeofence: boolean;
    distanceMeters: number;
  }>;
  workshop: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    name: string;
  };
}

function statusLabel(status: AttendanceStatus) {
  switch (status) {
    case 'NOT_STARTED': return 'Not clocked in';
    case 'WORKING': return 'Working';
    case 'ON_BREAK': return 'On break';
    case 'FINISHED': return 'Finished for today';
  }
}

function statusColor(status: AttendanceStatus) {
  switch (status) {
    case 'NOT_STARTED': return 'bg-gray-100 text-gray-700';
    case 'WORKING': return 'bg-green-100 text-green-800';
    case 'ON_BREAK': return 'bg-amber-100 text-amber-800';
    case 'FINISHED': return 'bg-blue-100 text-blue-800';
  }
}

function getLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

function locationErrorMessage(err: GeolocationPositionError | Error) {
  if ('code' in err) {
    if (err.code === 1) return 'Location access denied. Please enable location services for this site.';
    if (err.code === 2) return 'Unable to determine your location. Please try again.';
    if (err.code === 3) return 'Location request timed out. Please try again.';
  }
  return err.message || 'Failed to get location';
}

export default function AttendancePage() {
  const [data, setData] = useState<AttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationPreview, setLocationPreview] = useState<{ lat: number; lng: number } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await attendanceApi.status();
      setData(res.data.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Failed to load attendance status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 60000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const punch = async (action: 'in' | 'break' | 'end') => {
    setActionLoading(true);
    setError('');
    try {
      const position = await getLocation();
      const { latitude, longitude } = position.coords;
      setLocationPreview({ lat: latitude, lng: longitude });

      if (action === 'in') {
        const res = await attendanceApi.clockIn(latitude, longitude);
        setData(res.data.data);
      } else {
        const res = await attendanceApi.clockOut(
          latitude,
          longitude,
          action === 'break' ? 'BREAK' : 'END_OF_DAY',
        );
        setData(res.data.data);
      }
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (apiMsg) {
        setError(apiMsg);
      } else if (err instanceof GeolocationPositionError || err instanceof Error) {
        setError(locationErrorMessage(err as GeolocationPositionError));
      } else {
        setError('Failed to record attendance');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-7 h-7 text-brand-600" />
          Attendance
        </h1>
        <p className="text-gray-500 mt-1">
          Clock in and out at the workshop. Use clock out for breaks, then clock in again when you return.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-gray-500">Today ({data.workDate})</p>
                <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${statusColor(data.status)}`}>
                  {statusLabel(data.status)}
                </span>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-brand-700">{data.today.workFormatted}</p>
                <p className="text-xs text-gray-500">Worked · Break: {data.today.breakFormatted}</p>
              </div>
            </div>

            <div className="bg-brand-50 border border-brand-100 rounded-lg p-4 flex items-start gap-3">
              <MapPin className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-brand-900">Workshop location required</p>
                <p className="text-brand-700 mt-1">
                  You must be within {data.workshop.radiusMeters}m of {data.workshop.name} to clock in or out.
                  Location services must be enabled on your device.
                </p>
                {locationPreview && (
                  <p className="text-xs text-brand-600 mt-2">
                    Last position: {locationPreview.lat.toFixed(6)}, {locationPreview.lng.toFixed(6)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {(data.status === 'NOT_STARTED' || data.status === 'ON_BREAK') && (
                <button
                  onClick={() => punch('in')}
                  disabled={actionLoading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  Clock In
                </button>
              )}
              {data.status === 'WORKING' && (
                <>
                  <button
                    onClick={() => punch('break')}
                    disabled={actionLoading}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2 py-3"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coffee className="w-4 h-4" />}
                    Clock Out (Break)
                  </button>
                  <button
                    onClick={() => punch('end')}
                    disabled={actionLoading}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    End Day
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Today&apos;s log</h2>
            {data.events.length === 0 ? (
              <p className="text-sm text-gray-500">No clock events yet today.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.events.map((event) => (
                  <li key={event.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {event.eventType === 'CLOCK_IN'
                          ? 'Clock In'
                          : event.clockOutReason === 'BREAK'
                            ? 'Clock Out (Break)'
                            : 'Clock Out (End Day)'}
                      </p>
                      <p className="text-sm text-gray-500">{formatDate(event.eventAt)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${event.withinGeofence ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {event.withinGeofence ? 'On site' : `${Math.round(event.distanceMeters)}m away`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
