// Muestra un contrato (.DOCX ya convertido a bloques) con los huecos rellenados.
// Los huecos sin valor se ven resaltados para que se note qué falta.
import "./contracts.css";

const HOLE = /(\[[^[\]]{1,120}\])/; // para partir el texto (con grupo: el hueco queda como trozo)
const IS_HOLE = /^\[[^[\]]{1,120}\]$/;
const isSignLine = (text) => /^[_\s.]{6,}$/.test(text) || /^firma del? (cliente|prestador|proveedor|contratante|contratista)/i.test(text.trim());

function Runs({ runs, values }) {
  return (runs || []).map((r, i) => {
    const parts = String(r.text).split(HOLE).map((p, j) => {
      if (!IS_HOLE.test(p)) return p;
      const v = values?.[p];
      return v ? <span key={j} className="ctr-filled">{v}</span> : <span key={j} className="ctr-hole">{p}</span>;
    });
    const style = { fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? "italic" : undefined, textDecoration: r.u ? "underline" : undefined, whiteSpace: "pre-wrap" };
    return <span key={i} style={style}>{parts}</span>;
  });
}

export default function ContractView({ blocks, values }) {
  return (
    <div className="ctr-doc">
      {(blocks || []).map((b, i) => {
        if (b.t === "table") {
          return (
            <table key={i}><tbody>
              {b.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}><Runs runs={cell} values={values} /></td>)}</tr>)}
            </tbody></table>
          );
        }
        const text = (b.runs || []).map((r) => r.text).join("");
        if (isSignLine(text)) return null;
        if (b.t === "h") return <div key={i} className={`ctr-h ctr-h${b.level || 1}`} style={{ textAlign: b.align }}><Runs runs={b.runs} values={values} /></div>;
        if (b.t === "li") return <div key={i} className="ctr-li"><span>•</span><div><Runs runs={b.runs} values={values} /></div></div>;
        return <p key={i} style={{ textAlign: b.align || "justify" }}><Runs runs={b.runs} values={values} /></p>;
      })}
    </div>
  );
}
