import { catalog } from '@/lib/catalog';
import JourneyWithSample from '@/components/journey-with-sample';
import './fiole.css';
import './journey.css';
import './counseling.css';
export const metadata={title:'新しいカラー診断 | カラー未来AI'};
export default function FiolePage(){return <div className="fiole-scope"><JourneyWithSample data={catalog}/></div>;}
