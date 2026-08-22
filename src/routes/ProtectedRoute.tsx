const { user, loading } = useAuth();

if (loading) {
  return <div className="flex h-screen items-center justify-center">Loading...</div>;
}
if (!user) {
  return <Navigate to="/auth" replace />;
}

return <Outlet />;
