import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

export type PaceExplanationType = "overall" | "category" | "daily";

const explanations: Record<PaceExplanationType, string> = {
  overall:
    "Expected by now is based on how far through the month you are and your flexible budget.",
  category:
    "Expected by now is this category's monthly budget prorated across the month.",
  daily:
    "Safe daily spend is your remaining flexible budget divided by the days left in the month.",
};

interface PaceExplanationProps {
  type: PaceExplanationType;
  className?: string;
}

export function PaceExplanation({ type, className }: PaceExplanationProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={className}
            aria-label="Learn more about this calculation"
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <p>{explanations[type]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
