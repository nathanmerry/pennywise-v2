import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/shared/components/ui/input";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function TransactionsSearchBar({ value, onChange }: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        inputMode="search"
        placeholder="Search merchants, notes, categories"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="h-11 pl-9"
      />
    </div>
  );
}
