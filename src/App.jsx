import Dars01 from './Dars01'
// import Dars3D from './dars3d/Dars3D'

// // Versiya almashtirgich: `/` — asosiy 2D dars (o'zgartirilmagan),
// // `/?v=3d` — Three.js bilan qayta yig'ilgan 3D dublikat.
// const is3D = new URLSearchParams(window.location.search).get('v') === '3d';

// const switchStyle = {
//    position: 'fixed', bottom: 12, right: 12, zIndex: 999,
//    background: 'rgba(61, 58, 80, 0.82)', color: '#fff',
//    padding: '9px 16px', borderRadius: 99, textDecoration: 'none',
//    fontFamily: 'system-ui, sans-serif', fontWeight: 700, fontSize: 14,
//    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
// };

export const App = () => {
   return (
     <Dars01 />
     // <>
     //    {is3D ? <Dars3D /> : <Dars01 />}
     //    <a href={is3D ? '/' : '/?v=3d'} style={switchStyle}>
     //       {is3D ? "2D versiyaga o'tish" : "3D versiyaga o'tish"}
     //    </a>
     // </>
   );
}
