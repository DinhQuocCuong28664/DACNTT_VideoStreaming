/** Stand-in for pages that are being ported to v2 in S3; removed once every page exists. */
export default function Pending({ name }: { name: string }) {
  return (
    <div className="flex-center full-screen-center">
      <p className="text-secondary">{name}</p>
    </div>
  );
}
