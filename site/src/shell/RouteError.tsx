import { Link, useRouteError } from "react-router-dom";
import { isChunkLoadError } from "../lib/chunk-reload";
import { PageHeader } from "../ui";

// A page that could not render. The usual cause is a deploy while this tab was open: the page's code moved to a new
// build (lib/chunk-reload.ts reloads once on its own; this is what shows when it could not). The side panel stays.
export function RouteError() {
  const error = useRouteError();
  const updated = isChunkLoadError(error);
  return (
    <div className="page">
      <PageHeader
        kicker={updated ? "Updated" : "This page"}
        title={updated ? "The site was just updated" : "This page could not open"}
        lede={
          updated
            ? "This tab still runs the previous version. Reload to open the page in the current one."
            : "Reload to try again, or start from the Overview."
        }
        term={false}
      />
      <p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload
        </button>{" "}
        <Link to="/overview" className="btn">
          Open the Overview
        </Link>
      </p>
    </div>
  );
}
