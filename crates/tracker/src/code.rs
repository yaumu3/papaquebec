//! The codes surveillance replies and extended squitters alike carry: the
//! altitude code and the identity code, as in ICAO Annex 10 Volume IV.

/// Where the pulses 4, 2 and 1 of the digits A, B, C and D of a Mode A code
/// lie in a 13-bit identity code, from its last bit: they are interleaved as
/// C1 A1 C2 A2 C4 A4 - B1 D1 B2 D2 B4 D4.
const PULSES: [u32; 12] = [7, 9, 11, 1, 3, 5, 8, 10, 12, 0, 2, 4];

/// The Mode A code of a 13-bit identity code.
pub(crate) fn mode_a_code(identity: u32) -> u32 {
    let pulses = PULSES.iter().map(|pulse| identity >> pulse & 1);
    pulses.fold(0, |code, pulse| code << 1 | pulse)
}

/// The 13-bit identity code of a Mode A code.
pub(crate) fn identity(mode_a_code: u32) -> u32 {
    let pulses = PULSES.iter().rev().zip(0..);
    pulses.fold(0, |identity, (pulse, bit)| {
        identity | (mode_a_code >> bit & 1) << pulse
    })
}

/// The 13-bit altitude code of an altitude: steps of 25 ft from -1000 ft
/// around the M bit, clear, and the Q bit, set, which says so.
pub(crate) fn altitude_code(altitude_ft: i32) -> u32 {
    let steps = u32::try_from((altitude_ft + 1012).div_euclid(25)).unwrap_or(0);
    (steps & 0x7e0) << 2 | (steps & 0x10) << 1 | 0x10 | steps & 0xf
}

/// The 12 bits of an altitude code without its M bit, as a position message
/// carries them.
pub(crate) fn without_m(code: u32) -> u32 {
    code >> 1 & 0xfc0 | code & 0x3f
}

/// The altitude code of the 12 bits a position message carries, with its M
/// bit put back, clear.
pub(crate) fn with_m(code: u32) -> u32 {
    code << 1 & 0x1f80 | code & 0x3f
}

/// The altitude in feet of a 13-bit altitude code; none when it carries none
/// or counts in metres.
pub(crate) fn altitude(code: u32) -> Option<i32> {
    const M: u32 = 0x40;
    const Q: u32 = 0x10;
    if code == 0 || code & M != 0 {
        return None;
    }
    if code & Q == 0 {
        return gillham(code);
    }
    // With Q set the other bits count steps of 25 ft from -1000 ft.
    let steps = (code & 0x1f80) >> 2 | (code & 0x20) >> 1 | code & 0xf;
    Some(i32::try_from(steps).ok()? * 25 - 1000)
}

/// The altitude in feet of a Gillham code, the pulses of a Mode C reply:
/// D2 D4 A1 A2 A4 B1 B2 B4 count 500 ft in Gray code, and C1 C2 C4 count the
/// 100 ft within, up and then back down.
fn gillham(code: u32) -> Option<i32> {
    // The pulses lie in the code as C1 A1 C2 A2 C4 A4 M B1 Q B2 D2 B4 D4.
    const FIVE_HUNDREDS: [u32; 8] = [2, 0, 11, 9, 7, 5, 3, 1];
    const HUNDREDS: [u32; 3] = [12, 10, 8];
    let binary = |pulses: &[u32]| {
        let gray = pulses.iter().map(|pulse| code >> pulse & 1);
        let bits = gray.scan(0, |bit, pulse| {
            *bit ^= pulse;
            Some(*bit)
        });
        bits.fold(0, |value, bit| value << 1 | bit)
    };
    let five_hundreds = i32::try_from(binary(&FIVE_HUNDREDS)).ok()?;
    let within = match binary(&HUNDREDS) {
        7 => 5,
        within @ 1..=4 => i32::try_from(within).ok()?,
        _ => return None,
    };
    let hundreds = if five_hundreds % 2 == 0 {
        within
    } else {
        6 - within
    };
    Some(five_hundreds * 500 + hundreds * 100 - 1300)
}
