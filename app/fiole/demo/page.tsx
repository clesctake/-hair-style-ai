import { catalog } from '@/lib/catalog';
import JourneyWithSample from '@/components/journey-with-sample';
import '../fiole.css';
import '../journey.css';
import '../counseling.css';
export const metadata={title:'画像生成デモ | カラー未来AI'};
export default function SamplePage(){return <div className="fiole-scope"><JourneyWithSample data={catalog} startWithSample/></div>;}
