import {createRoot} from 'react-dom/client';
import {useState,useEffect} from 'react';
import {catalog} from '../src/lib/catalog';
import CounselingPageOne from '../src/components/counseling-page-one';
import ProDesignPage from '../src/components/pro-design-page';
import AfterSupportPage from '../src/components/after-support-page';
import AfterReviewPage from '../src/components/after-review-page';
import '../app/fiole/after-support/after-support.css';
import '../app/fiole/pro-design/pro-design.css';
import '../app/globals.css';
import '../app/fiole/fiole.css';
import '../app/fiole/journey.css';
import '../app/fiole/counseling.css';
import '../app/fiole/counseling-page1/page-one.css';
import '../app/fiole/counseling-page1/page-one-final.css';

// Same component and session/analysis/storage modules as the Next.js route.
// The private review URL uses the same formal API through a server Worker. Existing Next routes remain.
const root=document.getElementById('root');if(!root)throw new Error('Page 1 root was not found.');
function CounselingApplication(){
 const [page,setPage]=useState(()=>window.location.pathname==='/fiole/after-review'?4:window.location.pathname==='/fiole/after-support'?3:window.location.pathname==='/fiole/pro-design'?2:1);
 useEffect(()=>{const update=()=>setPage(window.location.pathname==='/fiole/after-review'?4:window.location.pathname==='/fiole/after-support'?3:window.location.pathname==='/fiole/pro-design'?2:1);window.addEventListener('popstate',update);return()=>window.removeEventListener('popstate',update);},[]);
 const navigate=(next:number)=>{window.history.pushState(null,'',next===3?'/fiole/after-support':next===2?'/fiole/pro-design':'/');setPage(next);window.scrollTo(0,0);document.title=next===3?'AFTER SUPPORT | COLOR FUTURE AI':next===2?'PRO DESIGN | COLOR FUTURE AI':'COUNSELING | COLOR FUTURE AI';};
 return page===4?<AfterReviewPage/>:page===3?<AfterSupportPage data={catalog} onCounseling={()=>navigate(1)} onProDesign={()=>navigate(2)}/>:page===2?<ProDesignPage data={catalog} onCounseling={()=>navigate(1)} onAfterSupport={()=>navigate(3)}/>:<CounselingPageOne data={catalog} onProceed={()=>navigate(2)}/>;
}
createRoot(root).render(<CounselingApplication/>);
