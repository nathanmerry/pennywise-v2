import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

export function SummaryCard({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-1'>
        <div className='text-2xl font-semibold'>{primary}</div>
        {secondary && (
          <p className='text-sm text-muted-foreground'>{secondary}</p>
        )}
      </CardContent>
    </Card>
  );
}
