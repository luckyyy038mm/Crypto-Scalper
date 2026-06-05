import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  // Destructure ref and key to avoid spreading them (they cause type conflicts with React 19)
  const { ref: _ref, key: _key, ...restProps } = props as React.ComponentProps<"svg"> & { ref?: React.Ref<SVGSVGElement>; key?: React.Key }
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...restProps}
    />
  )
}

export { Spinner }
