import { useEffect } from "react";
import { format } from "date-fns";
import {
  Building2,
  ExternalLink,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useConnections,
  useDeleteConnection,
  useSyncConnection,
} from "../hooks/use-connections";
import { getAuthUrl } from "../lib/api";

export function ConnectionsPage() {
  const { data: connections = [], isLoading, refetch } = useConnections();
  const deleteConn = useDeleteConnection();
  const syncConn = useSyncConnection();

  // Check for callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      refetch();
      window.history.replaceState({}, "", "/connections");
    }
  }, [refetch]);

  const handleConnect = async () => {
    const { url } = await getAuthUrl();
    window.location.href = url;
  };

  const statusIcon = (status: string) => {
    if (status === "active") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bank Connections</h1>
        <Button onClick={handleConnect}>
          <Building2 className="mr-2 h-4 w-4" />
          Connect Bank
          <ExternalLink className="ml-2 h-3 w-3" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Loading connections...
        </div>
      ) : connections.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No bank connections yet.</p>
          <Button variant="outline" onClick={handleConnect}>
            Connect your first bank
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <div key={conn.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon(conn.status)}
                  <div>
                    <h3 className="font-semibold">{conn.institutionName}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {conn.status}
                      </Badge>
                      {conn.lastSyncedAt && (
                        <span>
                          Last synced: {format(new Date(conn.lastSyncedAt), "dd MMM yyyy HH:mm")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncConn.mutate(conn.id)}
                    disabled={syncConn.isPending}
                  >
                    <RefreshCw className={`mr-1 h-3 w-3 ${syncConn.isPending ? "animate-spin" : ""}`} />
                    Sync
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this connection and all its data?")) {
                        deleteConn.mutate(conn.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Accounts */}
              {conn.accounts.length > 0 && (
                <>
                  <Separator />
                  <div className="grid gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Accounts</span>
                    {conn.accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                      >
                        <span className="text-sm">{acc.accountName}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {acc.accountType && <Badge variant="outline">{acc.accountType}</Badge>}
                          <span>{acc.currency}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
