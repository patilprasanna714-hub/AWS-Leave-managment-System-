export default function BalanceCard({ type, entitled, used, carry_forward }) {
  const remaining = entitled + carry_forward - used;
  return (
    <div className="card balance-card">
      <div className="type">{type}</div>
      <div className="remaining">{remaining} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>days left</span></div>
      <div className="breakdown">
        {entitled} entitled + {carry_forward} carried − {used} used
      </div>
    </div>
  );
}
