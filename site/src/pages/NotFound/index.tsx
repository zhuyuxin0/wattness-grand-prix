import { Link } from "react-router-dom";
import { PageHeader } from "../../ui";

export default function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader kicker="Not found" title="No page here" lede={<Link to="/overview">Open the overview</Link>} />
    </div>
  );
}
