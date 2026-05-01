import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "@/components/icons/themed-icons";
import type { MonthlyFinancials } from "@/lib/financial/types";

interface ReconciliationTabProps {
  propertyId: number;
  financials: MonthlyFinancials[];
  startYear: number;
  projectionYears: number;
}

export default function ReconciliationTab({ propertyId: _propertyId }: ReconciliationTabProps) {
  return (
    <div className="space-y-6" data-testid="reconciliation-tab">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg" data-testid="text-connected-accounts">Bank Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-accounts">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Bank reconciliation is not currently available</p>
            <p className="text-sm mt-1">This feature has been retired from the platform.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
