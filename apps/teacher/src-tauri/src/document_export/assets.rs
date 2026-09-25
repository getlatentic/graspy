use std::sync::OnceLock;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

const NUNITO: &[u8] = include_bytes!("../../export-assets/nunito/nunito-latin-wght-normal.woff2");
const KATEX_CSS: &str = include_str!("../../export-assets/katex/katex.min.css");
pub const KATEX_JS: &str = include_str!("../../export-assets/katex/katex.min.js");

macro_rules! katex_fonts {
    ($($name:literal),+ $(,)?) => {
        &[$(($name, include_bytes!(concat!("../../export-assets/katex/fonts/", $name)) as &[u8])),+]
    };
}

const KATEX_FONTS: &[(&str, &[u8])] = katex_fonts![
    "KaTeX_AMS-Regular.woff2",
    "KaTeX_Caligraphic-Bold.woff2",
    "KaTeX_Caligraphic-Regular.woff2",
    "KaTeX_Fraktur-Bold.woff2",
    "KaTeX_Fraktur-Regular.woff2",
    "KaTeX_Main-Bold.woff2",
    "KaTeX_Main-BoldItalic.woff2",
    "KaTeX_Main-Italic.woff2",
    "KaTeX_Main-Regular.woff2",
    "KaTeX_Math-BoldItalic.woff2",
    "KaTeX_Math-Italic.woff2",
    "KaTeX_SansSerif-Bold.woff2",
    "KaTeX_SansSerif-Italic.woff2",
    "KaTeX_SansSerif-Regular.woff2",
    "KaTeX_Script-Regular.woff2",
    "KaTeX_Size1-Regular.woff2",
    "KaTeX_Size2-Regular.woff2",
    "KaTeX_Size3-Regular.woff2",
    "KaTeX_Size4-Regular.woff2",
    "KaTeX_Typewriter-Regular.woff2",
];

pub fn embedded_font_css() -> &'static str {
    static CSS: OnceLock<String> = OnceLock::new();
    CSS.get_or_init(|| {
        let mut css = format!(
            "@font-face{{font-family:'Nunito';font-style:normal;font-weight:200 1000;font-display:block;src:url(data:font/woff2;base64,{}) format('woff2');}}\n{}",
            STANDARD.encode(NUNITO),
            KATEX_CSS,
        );
        for (name, bytes) in KATEX_FONTS {
            let stem = name.trim_end_matches(".woff2");
            let unused_fallbacks = format!(
                ",url(fonts/{stem}.woff) format(\"woff\"),url(fonts/{stem}.ttf) format(\"truetype\")"
            );
            css = css.replace(&unused_fallbacks, "");
            let source = format!("url(fonts/{name})");
            let embedded = format!(
                "url(data:font/woff2;base64,{})",
                STANDARD.encode(bytes)
            );
            css = css.replace(&source, &embedded);
        }
        css
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embeds_nunito_and_every_katex_font_without_file_dependencies() {
        let css = embedded_font_css();
        assert!(css.contains("font-family:'Nunito'"));
        assert_eq!(css.matches("data:font/woff2;base64,").count(), 21);
        assert!(!css.contains("url(fonts/"));
    }
}
