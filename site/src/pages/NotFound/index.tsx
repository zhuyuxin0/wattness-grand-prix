import { Link } from "react-router-dom";
import { PageHeader } from "../../ui";

export default function NotFoundPage() {
  return (
    <div className="page">
      <PageHeader kicker="Off track" title="No page here" lede={<Link to="/">Back to the race weekend</Link>} />
    </div>
  );
}
