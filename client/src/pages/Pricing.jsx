import { useNavigate } from 'react-router-dom';
import { api } from '../api';
export default function Pricing({ me }) {
  const nav = useNavigate();
  const go = async plan => { if (!me) return nav('/signup'); try { const { url } = await api('/checkout', 'POST', { plan }); location.href = url; } catch (e) { alert(e.message); } };
  return (<section className="page"><h1>Choose your plan</h1>
    <div className="grid two">
      <div className="card"><h3>Monthly</h3><p className="price">₹999<small>/month</small></p><p>Cancel any time. Enter every monthly draw.</p><button className="btn" onClick={() => go('monthly')}>Subscribe monthly</button></div>
      <div className="card hot"><h3>Yearly</h3><p className="price">₹9,999<small>/year</small></p><p>Two months free. Same draws, same charity share.</p><button className="btn" onClick={() => go('yearly')}>Subscribe yearly</button></div>
    </div></section>);
}
