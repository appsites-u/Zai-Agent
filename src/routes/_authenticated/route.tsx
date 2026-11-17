import {createFileRoute,redirect} from '@tanstack/react-router';
import {supabase} from '@/integrations/supabase/client';
import {WorkspaceShell} from '@/components/workspace/shell';
export const Route=createFileRoute('/_authenticated')({ssr:false,beforeLoad:async()=>{const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw redirect({to:'/auth'});},component:WorkspaceShell});
