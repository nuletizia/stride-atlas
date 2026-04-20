'use client';

import { useMemo } from 'react';
import { useTweaks, useData } from '@/lib/shared';
import DateRangePicker from './DateRangePicker';

// Shared time-range picker used in the View panel and the top-page subheader.
// Five preset chips (1M · 3M · 6M · 1Y · ALL) plus a "Custom" option that
// reveals two native date inputs. Bounds on the date inputs are the first and
// last activity dates from the ingested data so the user can't pick outside
// their history.
export default function TimeRangeControl() {
  const { timeRange, setTimeRange, customRange, setCustomRange } = useTweaks();
  const data = useData();

  const bounds = useMemo(() => {
    if (!data || !data.runs || !data.runs.length) {
      const today = new Date().toISOString().slice(0, 10);
      return { min: today, max: today };
    }
    let min = data.runs[0].date, max = data.runs[0].date;
    for (const r of data.runs) {
      if (r.date < min) min = r.date;
      if (r.date > max) max = r.date;
    }
    return { min, max };
  }, [data]);

  const activeRange = {
    from: customRange?.from || bounds.min,
    to: customRange?.to || bounds.max,
  };

  const selectPreset = (id) => {
    if (id === 'custom' && !customRange) {
      setCustomRange({ from: bounds.min, to: bounds.max });
    }
    setTimeRange(id);
  };

  const handleRangeChange = (next) => {
    setCustomRange(next);
    if (timeRange !== 'custom') setTimeRange('custom');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="seg">
        {['1m', '3m', '6m', '1y', 'all', 'custom'].map((r) => (
          <button
            key={r}
            className={timeRange === r ? 'on' : ''}
            onClick={() => selectPreset(r)}
          >
            {r === 'custom' ? 'Custom' : r.toUpperCase()}
          </button>
        ))}
      </div>
      {timeRange === 'custom' && (
        <DateRangePicker bounds={bounds} value={activeRange} onChange={handleRangeChange} />
      )}
    </div>
  );
}
