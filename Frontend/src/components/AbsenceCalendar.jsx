const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isWithin(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

export default function AbsenceCalendar({ approvedRequests, year, month }) {
  // month: 0-indexed (JS Date convention)
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function absenteesOn(day) {
    const dateStr = new Date(year, month, day).toISOString().slice(0, 10);
    return approvedRequests.filter((r) => isWithin(dateStr, r.start_date, r.end_date));
  }

  return (
    <div>
      <div className="calendar-grid" style={{ marginBottom: 6 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
            {w}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, idx) => (
          <div key={idx} className="cal-day" style={{ visibility: day ? 'visible' : 'hidden' }}>
            {day && (
              <>
                <div className="date-num">{day}</div>
                {absenteesOn(day).slice(0, 3).map((r) => (
                  <span key={r.request_id} className="absentee">{r.employee_name}</span>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
