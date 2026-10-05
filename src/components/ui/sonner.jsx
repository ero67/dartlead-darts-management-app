import React from "react"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner } from "sonner"
import { useTheme } from "../../contexts/ThemeContext"

// shadcn Toaster bound to the app's ThemeContext instead of next-themes.
const Toaster = ({ ...props }) => {
  const { isDarkMode } = useTheme()

  return (
    <Sonner
      theme={isDarkMode ? "dark" : "light"}
      className="toaster group"
      position="top-center"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      }}
      {...props}
    />
  )
}

export { Toaster }
