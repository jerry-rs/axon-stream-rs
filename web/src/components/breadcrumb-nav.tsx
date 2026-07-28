import { Fragment } from "react";
import { Link, useLocation } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home as HomeIcon } from "lucide-react";

function resolveLabel(path: string) {
  return path.split("/").pop() ?? path;
}

interface BreadcrumbNavProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
}

function CrumbLink({
  path,
  onNavigate,
  children,
}: {
  path: string;
  onNavigate?: (path: string) => void;
  children: React.ReactNode;
}) {
  const element = onNavigate ? (
    <button type="button" onClick={() => onNavigate(path)} />
  ) : (
    <Link to={path} />
  );

  return <BreadcrumbLink render={element}>{children}</BreadcrumbLink>;
}

export function BreadcrumbNav({ currentPath, onNavigate }: BreadcrumbNavProps) {
  const { pathname: locationPath } = useLocation();
  const pathname = currentPath ?? locationPath;
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>
              <HomeIcon className="size-4" />
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const crumbs = segments.map((_, i) => {
    const path = "/" + segments.slice(0, i + 1).join("/");
    return {
      path,
      label: resolveLabel(path),
      isCurrent: i === segments.length - 1,
    };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <CrumbLink path="/" onNavigate={onNavigate}>
            <HomeIcon className="size-4" />
          </CrumbLink>
        </BreadcrumbItem>

        {crumbs.map((crumb) => (
          <Fragment key={crumb.path}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {crumb.isCurrent ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <CrumbLink path={crumb.path} onNavigate={onNavigate}>
                  {crumb.label}
                </CrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
