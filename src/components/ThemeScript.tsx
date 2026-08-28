/**
 * Aplica el tema guardado antes del primer pintado, para que no haya un
 * flash blanco al entrar con el tema oscuro elegido.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('netflow-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
