import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="state">
      <h3>This page doesn't exist</h3>
      <p>Check the address, or go back to the overview.</p>
      <Link to="/" className="btn">Go to overview</Link>
    </div>
  );
}