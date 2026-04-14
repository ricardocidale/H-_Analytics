import UsersTab from "./UsersTab";

interface PeopleTabProps {
  initialTab?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PeopleTab({ initialTab }: PeopleTabProps) {
  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground" data-testid="text-people-title">Users</h2>
          <p className="text-muted-foreground text-sm">Manage user accounts and assignments.</p>
        </div>
      </div>

      <UsersTab />
    </div>
  );
}
