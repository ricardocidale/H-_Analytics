import * as React from "react";
import {
  Table,
  TableBody,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export interface TableShellProps {
  title: string;
  subtitle?: string;
  columns?: string[];
  headers?: string[];
  stickyLabel?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  banner?: React.ReactNode;
}

export function TableShell({ title, subtitle, columns, headers, stickyLabel, children, icon, action, banner }: TableShellProps) {
  const headerList = columns || headers || [];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle className="text-xl font-bold">{title}</CardTitle>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
        </div>
        {action}
      </CardHeader>
      {banner}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px] sticky left-0 bg-card z-10">
                {stickyLabel || "Category"}
              </TableHead>
              {headerList.map((h, i) => (
                <TableHead key={i} className="text-right whitespace-nowrap px-4">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>
    </Card>
  );
}
