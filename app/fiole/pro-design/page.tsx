import {catalog} from '@/lib/catalog';
import ProDesignPage from '@/components/pro-design-page';
import './pro-design.css';
export const metadata={title:'PRO DESIGN | COLOR FUTURE AI',description:'承認済みVisual Masterに基づく美容師専用の施術設計'};
export default function Page(){return <ProDesignPage data={catalog}/>;}
