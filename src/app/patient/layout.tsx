export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* We can add a top navigation bar here later */}
      {children}
    </div>
  );
}
