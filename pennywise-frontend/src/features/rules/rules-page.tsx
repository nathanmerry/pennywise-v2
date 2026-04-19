import { format } from "date-fns";
import {
  Trash2,
  Play,
  Pause,
  PlayCircle,
  ListFilter,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  useRules,
  useUpdateRule,
  useDeleteRule,
  useApplyRule,
} from "@/shared/hooks/use-rules";

export function RulesPage() {
  const { data: rules = [], isLoading } = useRules();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const applyRule = useApplyRule();

  const handleDelete = (id: string) => {
    if (confirm("Delete this rule?")) {
      deleteRule.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Rules</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically categorise or ignore transactions by merchant or description.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      ) : rules.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
          <ListFilter className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No rules yet.</p>
          <p className="text-xs text-muted-foreground">
            Create rules from the transactions table using the row action menu.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Match</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Ignore</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28">Created</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className={!rule.active ? "opacity-50" : ""}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {rule.matchType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{rule.matchValue}</TableCell>
                  <TableCell>
                    {rule.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {rule.categories.map((rc) => (
                          <Badge
                            key={rc.id}
                            variant="secondary"
                            className="text-xs"
                            style={
                              rc.category.color
                                ? { backgroundColor: rc.category.color + "20", color: rc.category.color }
                                : undefined
                            }
                          >
                            {rc.category.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {rule.setIgnored === true ? (
                      <Badge variant="outline" className="text-xs">Yes</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.active ? "default" : "secondary"} className="text-xs">
                      {rule.active ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(rule.createdAt), "dd MMM yy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Apply to existing transactions"
                        onClick={() => applyRule.mutate(rule.id)}
                        disabled={applyRule.isPending}
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={rule.active ? "Pause rule" : "Activate rule"}
                        onClick={() =>
                          updateRule.mutate({
                            id: rule.id,
                            data: { active: !rule.active },
                          })
                        }
                      >
                        {rule.active ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
