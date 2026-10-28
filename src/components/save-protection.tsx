'use client';
import {useEffect,useState} from 'react';
import {createSaveLifecycle} from '@/lib/save-lifecycle';
export function useSaveProtection(){
 const [control]=useState(createSaveLifecycle),[state,setState]=useState(control.state);
 useEffect(()=>control.subscribe(()=>setState(control.state())),[control]);
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(control.shouldBlock()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[control]);
 return {control,state};
}
export function SaveProtection({protection,onSave}:{protection:ReturnType<typeof useSaveProtection>;onSave:()=>Promise<unknown>}){
 const {state}=protection;
 if(state.phase==='IDLE')return null;
 const label=state.phase==='SAVING'?'保存中… この画面を閉じないでください':state.phase==='SAVED'?'保存完了':state.phase==='FAILED'?'保存失敗・編集内容は画面に保持しています':'未保存の変更があります';
 return <aside aria-label="相談内容の保存状態" style={{position:'fixed',bottom:8,left:8,zIndex:10020,maxWidth:'min(360px,90vw)',padding:'8px 12px',background:'#fffaf3',color:'#594533',border:'1px solid #dcccba',borderRadius:8,fontSize:12}}><span role={state.phase==='FAILED'?'alert':'status'}>{label}{state.error&&<small style={{display:'block'}}>{state.error}</small>}</span>{(state.phase==='DIRTY'||state.phase==='FAILED')&&<button type="button" onClick={()=>{void onSave().catch(()=>{/* The lifecycle retains the actual error and unsaved state. */});}} style={{marginLeft:8}}>{state.phase==='FAILED'?'再試行':'今すぐ保存'}</button>}</aside>;
}
