'use client';
import {useEffect,useState} from 'react';
import {siteSignInPath} from '@/lib/site-auth';
/** Only shown at an authentication error, outside every approved photo/sheet. */
export default function SiteSignIn(){const [href,setHref]=useState(siteSignInPath('/'));useEffect(()=>setHref(siteSignInPath(window.location.pathname+window.location.search+window.location.hash)),[]);return <a href={href} target="_top">ChatGPTでログインして続ける</a>;}
