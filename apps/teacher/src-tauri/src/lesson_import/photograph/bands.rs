//! A photographed page in the pieces the engine reads it in.
//!
//! The engine turns whatever it is shown into about one token per 48x48 pixels
//! of it, and that fixes both numbers here. The width a piece is submitted at
//! decides how much of a token each written line gets, and below about two
//! thousand the handwriting on a photographed page is not resolved — a whole
//! page submitted at once arrives as a thumbnail and is read as guesswork. The
//! tokens one piece may cost decides how much of the page fits in it, and past
//! about eight hundred the engine spends its answer repeating a block it has
//! already written instead of reading on.
//!
//! So every band is submitted at the same size, and what varies is how much of
//! the page fits in one. The cuts between them land where the writing leaves a
//! gap, so no band begins or ends half way down a written line.

use image::{imageops::FilterType, DynamicImage};

/// Pixels of a submitted image per image token, measured against the engine
/// graspy ships: 672x896 costs it 258 tokens and 1008x1344 costs it 580.
const PIXELS_PER_TOKEN: u32 = 2352;

const BAND_WIDTH: u32 = 2048;
const BAND_HEIGHT: u32 = IMAGE_TOKEN_BUDGET * PIXELS_PER_TOKEN / BAND_WIDTH;

/// What the engine must be able to hold in one batch to be shown a band, and
/// what it must never be asked to hold more than.
pub(crate) const IMAGE_TOKEN_BUDGET: u32 = 800;

/// The size the writing is measured at. Where the gaps between lines fall is
/// the same question at any size, and this one is quick to answer.
const MEASURING_WIDTH: u32 = 320;

/// How much darker than the paper around it a pixel must be to be writing.
const DARKER_THAN_PAPER: i16 = 18;
const PAPER_AROUND_IT: f32 = 8.0;

/// The page in the pieces it is read in, top to bottom.
pub(crate) fn bands(page: &DynamicImage) -> Vec<DynamicImage> {
    let bottoms = cut_rows(page);
    let tops = std::iter::once(0).chain(bottoms.iter().copied());
    tops.zip(bottoms.iter().copied())
        .map(|(top, bottom)| submitted(page, top, bottom))
        .collect()
}

/// The row each band ends on, the last being the foot of the page.
fn cut_rows(page: &DynamicImage) -> Vec<u32> {
    let writing = Writing::across(page);
    let step = (BAND_HEIGHT * page.width() / BAND_WIDTH).max(1);
    let mut rows = Vec::new();
    let mut top = 0;
    while top < page.height() {
        top = writing.quietest_before(top + step, step / 4);
        rows.push(top);
    }
    rows
}

/// One band as the engine is shown it: the page's full width, cut between two
/// rows, at the size every band is submitted at.
fn submitted(page: &DynamicImage, top: u32, bottom: u32) -> DynamicImage {
    let band = page.crop_imm(0, top, page.width(), bottom - top);
    let height = (band.height() * BAND_WIDTH / page.width()).max(1);
    band.resize_exact(BAND_WIDTH, height, FilterType::Lanczos3)
}

/// How much writing each row of the page carries.
///
/// Writing is what is darker than the paper immediately around it, which is
/// what tells ink from the shadow down a curled page and from the desk the
/// page is lying on.
struct Writing {
    per_row: Vec<u32>,
    page_height: u32,
}

impl Writing {
    fn across(page: &DynamicImage) -> Self {
        let height = (page.height() * MEASURING_WIDTH / page.width().max(1)).max(1);
        let grey = page
            .resize_exact(MEASURING_WIDTH, height, FilterType::Triangle)
            .into_luma8();
        let paper = image::imageops::blur(&grey, PAPER_AROUND_IT);
        let per_row = grey
            .rows()
            .zip(paper.rows())
            .map(|(row, around)| {
                row.zip(around)
                    .filter(|(ink, paper)| {
                        i16::from(ink[0]) < i16::from(paper[0]) - DARKER_THAN_PAPER
                    })
                    .count() as u32
            })
            .collect();
        Self {
            per_row,
            page_height: page.height(),
        }
    }

    /// The row carrying least writing in the `reach` before a cut was wanted.
    /// Looking back rather than either way is what keeps a band inside the
    /// tokens its height was chosen for. A cut past the last row of the page
    /// is the foot of the page.
    fn quietest_before(&self, wanted: u32, reach: u32) -> u32 {
        if wanted >= self.page_height {
            return self.page_height;
        }
        let first = self.measured_at(wanted.saturating_sub(reach));
        let last = self.measured_at(wanted).max(first + 1);
        let quietest = (first..last)
            .min_by_key(|&row| self.per_row[row])
            .unwrap_or(first);
        self.middle_of(quietest)
    }

    fn measured_at(&self, row: u32) -> usize {
        (row as usize * self.per_row.len() / self.page_height.max(1) as usize)
            .min(self.per_row.len().saturating_sub(1))
    }

    /// The row of the page halfway down a measured row, so a cut chosen from
    /// the measurement lands in the middle of the gap it found.
    fn middle_of(&self, measured: usize) -> u32 {
        let rows = self.per_row.len().max(1) as u64;
        ((measured as u64 * 2 + 1) * u64::from(self.page_height) / (2 * rows)) as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    /// A page of writing: dark lines with paper between them at the pitch a
    /// photographed exercise book is written at, and nothing below `written_to`
    /// — a plan that ends part way down the page, as most of them do.
    fn ruled_page(width: u32, height: u32, pitch: u32, written_to: u32) -> DynamicImage {
        let mut page = RgbImage::from_pixel(width, height, Rgb([255, 255, 255]));
        for (row, pixel) in page.enumerate_rows_mut().flat_map(|(row, pixels)| {
            pixels.map(move |(_, _, pixel)| (row, pixel))
        }) {
            if row < written_to && row % pitch < pitch / 2 {
                *pixel = Rgb([20, 20, 20]);
            }
        }
        DynamicImage::ImageRgb8(page)
    }

    fn written_at(page: &DynamicImage, row: u32) -> bool {
        page.to_luma8().get_pixel(page.width() / 2, row)[0] < 128
    }

    #[test]
    fn no_band_costs_the_engine_more_than_it_can_hold() {
        for (width, height, written_to) in [
            (2048, 3000, 3000),
            (1920, 2560, 2560),
            (476, 1052, 1052),
            (4032, 3024, 3024),
            // A plan that stops half way down leaves a stretch with no writing
            // to cut in, which is where a cut can be dragged past its band.
            (1920, 2560, 900),
        ] {
            for band in bands(&ruled_page(width, height, 60, written_to)) {
                let tokens = band.width() * band.height() / PIXELS_PER_TOKEN;
                assert!(
                    tokens <= IMAGE_TOKEN_BUDGET,
                    "a {width}x{height} page produced a band of {tokens} tokens",
                );
            }
        }
    }

    #[test]
    fn every_band_is_submitted_wide_enough_to_resolve_handwriting() {
        for band in bands(&ruled_page(1920, 2560, 60, 2560)) {
            assert_eq!(band.width(), BAND_WIDTH);
        }
    }

    #[test]
    fn a_band_ends_between_written_lines_rather_than_through_one() {
        let page = ruled_page(2048, 3000, 60, 3000);

        let cuts = cut_rows(&page);

        assert!(cuts.len() > 1, "expected several bands, got {cuts:?}");
        for row in cuts.iter().take(cuts.len() - 1) {
            assert!(!written_at(&page, *row), "band ended through the line at {row}");
        }
    }

    /// Where the writing has a clear gap either side of a wanted cut, looking
    /// back and looking both ways find the same row, so this is the rule
    /// itself: a cut moves a band's foot earlier or leaves it alone, and the
    /// tokens the band was sized for stay an upper bound rather than a guess.
    #[test]
    fn a_cut_is_never_placed_later_than_it_was_wanted() {
        let writing = Writing::across(&ruled_page(1920, 2560, 60, 900));

        for wanted in [400, 860, 1300, 1720, 2100] {
            let cut = writing.quietest_before(wanted, 215);
            assert!(cut <= wanted, "a cut wanted at {wanted} was placed at {cut}");
        }
    }

    #[test]
    fn the_bands_cover_the_page_without_losing_a_row_between_them() {
        let page = ruled_page(1920, 2560, 60, 2560);

        let cuts = cut_rows(&page);

        assert_eq!(cuts.last().copied(), Some(page.height()));
        for pair in cuts.windows(2) {
            assert!(pair[1] > pair[0], "bands must move down the page: {cuts:?}");
        }
    }
}
