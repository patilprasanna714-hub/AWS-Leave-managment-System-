export default function StatusPill({ status }) {
  const label = status.replaceAll('_', ' ');
  return <span className={`status-pill status-${status}`}>{label}</span>;
}
