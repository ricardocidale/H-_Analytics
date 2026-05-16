import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconRefreshCw, IconProperties } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "./hooks";
import { formatDateTime } from "@/lib/formatters";

interface AdminProperty {
  id: number;
  name: string;
  archivedAt: string | null;
  scenarioId: number;
  createdAt: string;
}

export default function AdminPropertiesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: properties, isLoading } = useQuery<AdminProperty[]>({
    queryKey: ["admin", "properties", "includeArchived"],
    queryFn: adminFetch<AdminProperty[]>(
      "/api/admin/properties?includeArchived=true",
      "Failed to fetch properties",
    ),
  });

  const archivedProperties = (properties ?? []).filter((p) => p.archivedAt !== null);

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/properties/${id}/restore`, {}, {
        fallbackMessage: "Failed to restore property",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "properties"] });
      toast({ title: "Property Restored", description: "Property has been restored to active." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <IconProperties className="w-4 h-4" />
              Archived Properties
            </CardTitle>
            <CardDescription className="label-text">
              {archivedProperties.length} archived{" "}
              {archivedProperties.length === 1 ? "property" : "properties"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent-pop" />
          </div>
        ) : archivedProperties.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No archived properties found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archivedProperties.map((property) => (
                <TableRow
                  key={property.id}
                  data-testid={`row-archived-property-${property.id}`}
                >
                  <TableCell className="font-medium">{property.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {property.archivedAt ? formatDateTime(property.archivedAt) : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreMutation.mutate(property.id)}
                      disabled={restoreMutation.isPending}
                      data-testid={`button-restore-property-${property.id}`}
                      className="flex items-center gap-1.5"
                    >
                      {restoreMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <IconRefreshCw className="w-3 h-3" />
                      )}
                      Restore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
