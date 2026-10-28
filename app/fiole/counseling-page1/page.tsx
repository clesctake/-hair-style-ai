import {catalog} from '@/lib/catalog';
import CounselingPageOne from '@/components/counseling-page-one';
import '../fiole.css';
import '../journey.css';
import '../counseling.css';
import './page-one.css';
import './page-one-final.css';
export const metadata={title:'COUNSELING | COLOR FUTURE AI',description:'正式Visual Masterに基づくPage 1カウンセリング'};
export default function CounselingPage(){return <CounselingPageOne data={catalog}/>;}
