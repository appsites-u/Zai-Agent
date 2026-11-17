import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
const ThemeContext=createContext({dark:true,toggle:()=>{}});
export function ThemeProvider({children}:{children:ReactNode}) {
  const [dark,setDark]=useState(true);
  useEffect(()=>{try {const saved=localStorage.getItem('zai-theme');setDark(saved!=='light');}catch{/* Storage may be unavailable. */}},[]);
  useEffect(()=>{document.documentElement.classList.toggle('dark',dark);},[dark]);
  function toggle(){setDark(value=>{const next=!value;try{localStorage.setItem('zai-theme',next?'dark':'light');}catch{/* Keep the current-session theme. */}return next;});}
  return <ThemeContext.Provider value={{dark,toggle}}>{children}</ThemeContext.Provider>;
}
export function ThemeToggle(){const {dark,toggle}=useContext(ThemeContext);return <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark?'Switch to light theme':'Switch to dark theme'} title={dark?'Switch to light theme':'Switch to dark theme'}>{dark?<Sun/>:<Moon/>}</Button>;}
