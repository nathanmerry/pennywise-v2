import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { AnalysisMerchantRow } from "@/shared/lib/api";
import { formatCurrency } from "../lib/spending-formatters";

export function TopMerchantsCard({
  merchants,
}: {
  merchants: AnalysisMerchantRow[];
}) {
  return (
    <Card>
      <CardHeader className='space-y-2'>
        <CardTitle className='text-base'>Top merchants in range</CardTitle>
        <p className='text-sm text-muted-foreground'>
          The fastest way to see what is actually driving the spend.
        </p>
      </CardHeader>
      <CardContent className='space-y-3'>
        {merchants.length > 0 ? (
          merchants.map((merchant, index) => (
            <div
              key={merchant.merchant}
              className='flex items-start justify-between gap-3 rounded-lg border p-3'
            >
              <div className='min-w-0'>
                <p className='text-xs text-muted-foreground'>{index + 1}</p>
                <p className='truncate font-medium'>{merchant.merchant}</p>
                <p className='text-sm text-muted-foreground'>
                  {merchant.transactionCount} transactions · avg{" "}
                  {formatCurrency(merchant.averageTransaction)}
                </p>
              </div>
              <span className='shrink-0 font-semibold'>
                {formatCurrency(merchant.spend)}
              </span>
            </div>
          ))
        ) : (
          <p className='text-sm text-muted-foreground'>
            No merchant data for this range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
