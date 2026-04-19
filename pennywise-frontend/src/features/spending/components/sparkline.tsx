export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);

  if (values.length === 0 || max === 0) {
    return <div className='h-8 w-24 rounded bg-muted/60' />;
  }

  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox='0 0 100 100' className='h-8 w-24 overflow-visible'>
      <polyline
        fill='none'
        stroke='currentColor'
        strokeWidth='8'
        strokeLinecap='round'
        strokeLinejoin='round'
        points={points}
        className='text-primary'
      />
    </svg>
  );
}
