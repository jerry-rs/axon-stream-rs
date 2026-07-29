import { Fragment } from "react";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface EntryBreadcrumbProps {
  /** 相对路径，如 "movies/2024"；空串表示根目录 */
  currentPath: string;
  onPathChange: (path: string) => void;
}

/**
 * 目录路径面包屑：按 "/" 切割 currentPath，
 * 点击任意前缀段回跳，当前段仅展示不可点击。
 */
export function EntryBreadcrumb({
  currentPath,
  onPathChange,
}: EntryBreadcrumbProps) {
  const segments = currentPath.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {segments.length === 0 ? (
            <BreadcrumbPage>
              <Home className="size-4" />
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              render={<button type="button" />}
              className="cursor-pointer"
              onClick={() => onPathChange("")}
            >
              <Home className="size-4" />
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {segments.map((segment, index) => {
          const path = segments.slice(0, index + 1).join("/");
          const isLast = index === segments.length - 1;
          return (
            <Fragment key={path}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<button type="button" />}
                    className="cursor-pointer"
                    onClick={() => onPathChange(path)}
                  >
                    {segment}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
