import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '@/components/workspace/auth';
export const Route=createFileRoute('/auth')({head:()=>({meta:[{title:'Sign in — Zai Agent'},{name:'description',content:'Secure access to App Sites internal Zai Agent workspace.'},{property:'og:title',content:'Sign in — Zai Agent'},{property:'og:description',content:'App Sites private intelligence operations workspace.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:AuthPage});
