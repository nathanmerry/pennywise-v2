import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { fetchMonthlyExport } from "@/shared/lib/api";
import { monthlyExportToMarkdown } from "@/features/budget/lib/export-markdown";

type ExportFormat = "ai" | "human";

export function ExportMonthDialog({ month }: { month: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        {/* Mount the query-bearing body only while open. Radix unmounts closed
            content, so every open remounts and refetches — the snapshot always
            reflects the latest budget AND transaction edits, from any source. */}
        {open && <ExportMonthDialogBody month={month} />}
      </DialogContent>
    </Dialog>
  );
}

function ExportMonthDialogBody({ month }: { month: string }) {
  const [format, setFormat] = useState<ExportFormat>("ai");
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["monthlyExport", month],
    queryFn: () => fetchMonthlyExport(month),
    retry: false,
    // Snapshot must be current every time the dialog opens.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const text = useMemo(() => {
    if (!data) return "";
    return format === "ai"
      ? JSON.stringify(data, null, 2)
      : monthlyExportToMarkdown(data);
  }, [data, format]);

  const filename = `pennywise-${month}.${format === "ai" ? "json" : "md"}`;

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  }

  function handleDownload() {
    if (!text) return;
    const blob = new Blob([text], {
      type: format === "ai" ? "application/json" : "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Export month</DialogTitle>
        <DialogDescription>
          A snapshot of this cycle&apos;s budget, spending and transactions — for
          pasting or uploading into ChatGPT, Claude, and other AI assistants.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
        <TabsList>
          <TabsTrigger value="ai">
            <Sparkles className="h-4 w-4 mr-2" />
            AI · JSON
          </TabsTrigger>
          <TabsTrigger value="human">
            <FileText className="h-4 w-4 mr-2" />
            Readable · Markdown
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border bg-muted/30">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Building export…
          </div>
        ) : error ? (
          <div className="px-4 py-16 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to build export."}
          </div>
        ) : (
          <ScrollArea className="h-[45vh]">
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs">
              {text}
            </pre>
          </ScrollArea>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <span className="self-center text-xs text-muted-foreground">
          {data ? `${data.transactions.length} transactions · ${filename}` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopy} disabled={!text}>
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            Copy
          </Button>
          <Button onClick={handleDownload} disabled={!text}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
