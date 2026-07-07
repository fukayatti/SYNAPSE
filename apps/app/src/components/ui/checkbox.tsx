import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer size-[20px] shrink-0 border-border border-thick bg-background transition-all outline-none",
				"data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
				"focus-visible:border-heavy focus-visible:ring-0",
				"disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-input-disabled",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="flex items-center justify-center text-current transition-none [&_svg]:stroke-[3px]"
			>
				<CheckIcon className="size-3.5" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
