import {useRouter,type ErrorComponentProps} from '@tanstack/react-router';
import {Button} from '@/components/ui/button';
export function WorkspaceError({error}:ErrorComponentProps){const router=useRouter();return <main className="mx-auto max-w-lg px-6 py-24"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p role="alert" className="my-5 text-muted-foreground">{error instanceof Error?error.message:'Could not load this page.'}</p><Button onClick={()=>router.invalidate()}>Try again</Button></main>;}
export function WorkspaceNotFound(){return <p className="p-8">This workspace record was not found.</p>;}
