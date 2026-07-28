import { useState } from "react"
import { BreadcrumbNav } from "@/components/breadcrumb-nav"
import { EntryTable } from "@/features/entry/components/entry-table"

export function HomePage() {
  const [currentPath, setCurrentPath] = useState("")

  return (
    <div className="flex  flex-col gap-3">
      <div className="p-3 border rounded-md">
        <BreadcrumbNav currentPath={currentPath} onNavigate={setCurrentPath} />
      </div>
      <div className="flex rounded-md justify-center">
        <EntryTable currentPath={currentPath} onNavigate={setCurrentPath} />
      </div>
    </div>
  )
}
