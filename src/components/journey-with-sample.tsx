'use client';
import { useEffect, useState } from 'react';
import type { CatalogData } from '@/lib/catalog';
import { createJourneySample, type JourneySample } from '@/lib/journey-sample';
import assets from '@/data/journey_sample_assets.json';
import CounselingStudio from './counseling-studio';
import { createHairImageGenerator } from '@/lib/hair-image-client';

const imageGenerator = createHairImageGenerator();

export default function JourneyWithSample({data,startWithSample=false}:{data:CatalogData;startWithSample?:boolean}){
 const [sample,setSample]=useState<JourneySample>();
 const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;void createJourneySample(data,assets).then(value=>{if(!cancelled)setSample(value);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'サンプルを開けませんでした。');});return()=>{cancelled=true;};},[data]);
 if(startWithSample&&!sample)return <div className="sample-loading" role="status">{error||'写真入りサンプルを準備しています…'}</div>;
 return <CounselingStudio data={data} sampleCase={sample} startWithSample={startWithSample} imageGenerator={imageGenerator}/>;
}
