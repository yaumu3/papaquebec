//! The Beast binary format, in which readsb and dump1090 pass on what they receive.
//!
//! A frame is `0x1a`, a type, a 48-bit timestamp, a signal level and the
//! message. A `0x1a` anywhere after the type is sent twice.

const ESCAPE: u8 = 0x1a;
/// The timestamp and the signal level.
const HEADER_LEN: usize = 7;
const SHORT_LEN: usize = 7;
const LONG_LEN: usize = 14;
/// The types of the frames that carry a short and a long Mode S message.
const SHORT: u8 = b'2';
const LONG: u8 = b'3';

/// One Mode S message as the receiver heard it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    /// Ticks of the receiver's 12 MHz clock, counted from a start of its own.
    pub timestamp: u64,
    /// 0 to 255: the square root of the power against full scale.
    pub signal: u8,
    message: [u8; LONG_LEN],
    len: usize,
}

impl Frame {
    /// The timestamp readsb gives a message whose position came by
    /// multilateration: it spells that out.
    pub const MULTILATERATED: u64 = 0xff00_4d4c_4154;

    /// A frame of the Mode S message, which is 7 or 14 bytes; none of another length.
    #[must_use]
    pub fn new(timestamp: u64, signal: u8, message: &[u8]) -> Option<Self> {
        let mut bytes = [0; LONG_LEN];
        bytes.get_mut(..message.len())?.copy_from_slice(message);
        matches!(message.len(), SHORT_LEN | LONG_LEN).then_some(Self {
            timestamp,
            signal,
            message: bytes,
            len: message.len(),
        })
    }

    /// The frame as a source sends it.
    #[must_use]
    pub fn write(&self) -> Vec<u8> {
        let r#type = if self.len == SHORT_LEN { SHORT } else { LONG };
        let timestamp = self.timestamp.to_be_bytes();
        let body = timestamp[2..]
            .iter()
            .chain([&self.signal])
            .chain(self.message());
        let mut frame = vec![ESCAPE, r#type];
        for &byte in body {
            frame.push(byte);
            if byte == ESCAPE {
                frame.push(byte);
            }
        }
        frame
    }

    /// The 7 or 14 bytes of the message.
    #[must_use]
    pub fn message(&self) -> &[u8] {
        &self.message[..self.len]
    }

    /// Whether the message came by multilateration.
    #[must_use]
    pub fn multilaterated(&self) -> bool {
        self.timestamp == Self::MULTILATERATED
    }

    /// The power in dB against full scale; none when the receiver measured none.
    #[must_use]
    pub fn rssi_dbfs(&self) -> Option<f64> {
        (self.signal > 0).then(|| 20.0 * (f64::from(self.signal) / 255.0).log10())
    }
}

/// Frames out of a byte stream, however the stream is cut up.
#[derive(Default)]
pub struct Reader {
    pending: Vec<u8>,
}

impl Reader {
    /// The Mode S frames that the bytes read next complete. Mode A/C and status
    /// frames are left out, and so is whatever is not a frame.
    pub fn read(&mut self, bytes: &[u8]) -> Vec<Frame> {
        self.pending.extend_from_slice(bytes);
        let mut frames = Vec::new();
        let mut read = 0;
        loop {
            match parse(&self.pending[read..]) {
                Parsed::Frame(frame, len) => {
                    frames.extend(frame);
                    read += len;
                }
                Parsed::Skip(len) => read += len,
                Parsed::Incomplete => break,
            }
        }
        self.pending.drain(..read);
        frames
    }
}

/// What the bytes start with.
enum Parsed {
    /// A whole frame of so many bytes, given when it carries a Mode S message.
    Frame(Option<Frame>, usize),
    /// So many bytes that belong to no frame.
    Skip(usize),
    /// The start of a frame, or nothing.
    Incomplete,
}

fn parse(bytes: &[u8]) -> Parsed {
    let Some(&first) = bytes.first() else {
        return Parsed::Incomplete;
    };
    if first != ESCAPE {
        let start = bytes.iter().position(|&byte| byte == ESCAPE);
        return Parsed::Skip(start.unwrap_or(bytes.len()));
    }
    let Some(&r#type) = bytes.get(1) else {
        return Parsed::Incomplete;
    };
    let Some(message_len) = message_len(r#type) else {
        return Parsed::Skip(1);
    };
    let mut body = [0; HEADER_LEN + LONG_LEN];
    let body = &mut body[..HEADER_LEN + message_len];
    let mut at = 2;
    for byte in body.iter_mut() {
        match (bytes.get(at), bytes.get(at + 1)) {
            (None, _) | (Some(&ESCAPE), None) => return Parsed::Incomplete,
            (Some(&ESCAPE), Some(&ESCAPE)) => at += 1,
            // Another frame starts before this one ends.
            (Some(&ESCAPE), Some(_)) => return Parsed::Skip(at),
            _ => {}
        }
        *byte = bytes[at];
        at += 1;
    }
    let mode_s = matches!(r#type, SHORT | LONG);
    Parsed::Frame(mode_s.then(|| frame(body)).flatten(), at)
}

/// The length of the message in a frame of the type; none for an unknown type.
fn message_len(r#type: u8) -> Option<usize> {
    match r#type {
        // Mode A/C
        b'1' => Some(2),
        SHORT => Some(SHORT_LEN),
        // The receiver's status is as long as a long message.
        LONG | b'4' => Some(LONG_LEN),
        _ => None,
    }
}

fn frame(body: &[u8]) -> Option<Frame> {
    let (header, message) = body.split_at(HEADER_LEN);
    let timestamp = header[..6]
        .iter()
        .fold(0, |ticks, &byte| ticks << 8 | u64::from(byte));
    Frame::new(timestamp, header[6], message)
}

#[cfg(test)]
mod tests {
    use super::{Frame, Reader};

    /// An identification message, from the examples of "The 1090 Megahertz Riddle".
    const LONG: [u8; 14] = [
        0x8d, 0x48, 0x40, 0xd6, 0x20, 0x2c, 0xc3, 0x71, 0xc3, 0x2c, 0xe0, 0x57, 0x60, 0x98,
    ];
    /// As many bytes as a short message has; they are not a valid one.
    const SHORT: [u8; 7] = [0x5d, 0x48, 0x40, 0xd6, 0x20, 0x2c, 0xc3];
    const TIMESTAMP: [u8; 6] = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05];

    fn framed(r#type: u8, timestamp: [u8; 6], signal: u8, message: &[u8]) -> Vec<u8> {
        let body = timestamp.iter().chain([&signal]).chain(message);
        let escaped = body.flat_map(|&byte| {
            if byte == 0x1a {
                vec![byte; 2]
            } else {
                vec![byte]
            }
        });
        [0x1a, r#type].into_iter().chain(escaped).collect()
    }

    fn long(timestamp: u64, signal: u8, message: [u8; 14]) -> Frame {
        Frame::new(timestamp, signal, &message).expect("a long message")
    }

    #[test]
    fn long_frame_is_read_with_its_timestamp_and_signal() {
        // Arrange
        let bytes = framed(b'3', TIMESTAMP, 128, &LONG);

        // Act
        let frames = Reader::default().read(&bytes);

        // Assert
        assert_eq!(frames, [long(0x0001_0203_0405, 128, LONG)]);
    }

    #[test]
    fn short_frame_carries_seven_bytes() {
        // Arrange
        let bytes = framed(b'2', TIMESTAMP, 128, &SHORT);

        // Act
        let frames = Reader::default().read(&bytes);

        // Assert
        let messages: Vec<_> = frames.iter().map(Frame::message).collect();
        assert_eq!(messages, [&SHORT[..]]);
    }

    #[test]
    fn doubled_escape_is_one_byte() {
        // Arrange
        let mut message = LONG;
        message[5] = 0x1a;
        let bytes = framed(b'3', [0x1a; 6], 0x1a, &message);

        // Act
        let frames = Reader::default().read(&bytes);

        // Assert
        assert_eq!(frames, [long(0x1a1a_1a1a_1a1a, 0x1a, message)]);
    }

    #[test]
    fn frame_cut_anywhere_is_completed_by_the_next_read() {
        // Arrange
        let mut message = LONG;
        message[5] = 0x1a;
        let bytes = framed(b'3', TIMESTAMP, 128, &message);

        // Act
        let frames: Vec<_> = (1..bytes.len())
            .map(|cut| {
                let mut reader = Reader::default();
                let early = reader.read(&bytes[..cut]);
                (early, reader.read(&bytes[cut..]))
            })
            .collect();

        // Assert
        let whole = (vec![], vec![long(0x0001_0203_0405, 128, message)]);
        assert_eq!(frames, vec![whole; bytes.len() - 1]);
    }

    #[test]
    fn frames_follow_each_other_in_one_read() {
        // Arrange
        let bytes = [
            framed(b'3', TIMESTAMP, 1, &LONG),
            framed(b'2', TIMESTAMP, 2, &SHORT),
        ]
        .concat();

        // Act
        let frames = Reader::default().read(&bytes);

        // Assert
        let signals: Vec<_> = frames.iter().map(|frame| frame.signal).collect();
        assert_eq!(signals, [1, 2]);
    }

    #[test]
    fn mode_ac_and_status_frames_are_left_out() {
        // Arrange
        let bytes = [
            framed(b'1', TIMESTAMP, 1, &[0x12, 0x34]),
            framed(b'4', TIMESTAMP, 2, &[0; 14]),
            framed(b'2', TIMESTAMP, 3, &SHORT),
        ]
        .concat();

        // Act
        let frames = Reader::default().read(&bytes);

        // Assert
        let signals: Vec<_> = frames.iter().map(|frame| frame.signal).collect();
        assert_eq!(signals, [3]);
    }

    #[test]
    fn what_is_not_a_frame_is_skipped() {
        // Arrange
        let cut_short = &framed(b'3', TIMESTAMP, 1, &LONG)[..12];
        let bytes = [
            &[0x00, 0xff][..],
            &[0x1a, b'9', 0x00],
            cut_short,
            &framed(b'2', TIMESTAMP, 2, &SHORT),
        ]
        .concat();

        // Act
        let frames = Reader::default().read(&bytes);

        // Assert
        let signals: Vec<_> = frames.iter().map(|frame| frame.signal).collect();
        assert_eq!(signals, [2]);
    }

    #[test]
    fn frame_is_written_as_it_is_read() {
        // Arrange: a long message, a short one, and one full of the escape
        let mut escaped = LONG;
        escaped[5] = 0x1a;
        let frames = [
            Frame::new(0x0001_0203_0405, 128, &LONG),
            Frame::new(0x0001_0203_0405, 128, &SHORT),
            Frame::new(0x1a1a_1a1a_1a1a, 0x1a, &escaped),
        ];

        // Act
        let written = frames.map(|frame| frame.map(|frame| frame.write()));

        // Assert
        let expected = [
            framed(b'3', TIMESTAMP, 128, &LONG),
            framed(b'2', TIMESTAMP, 128, &SHORT),
            framed(b'3', [0x1a; 6], 0x1a, &escaped),
        ];
        assert_eq!(written, expected.map(Some));
    }

    #[test]
    fn frame_carries_a_mode_s_message_only() {
        // Arrange: as long as a Mode A/C reply, and longer than any message
        let messages: [&[u8]; 3] = [&[0; 2], &[0; 15], &SHORT];

        // Act
        let frames = messages.map(|message| Frame::new(0, 0, message).is_some());

        // Assert
        assert_eq!(frames, [false, false, true]);
    }

    #[test]
    fn signal_is_a_power_against_full_scale() {
        // Arrange
        let frames = [255, 128, 0].map(|signal| long(0, signal, LONG));

        // Act
        let powers = frames.map(|frame| frame.rssi_dbfs());

        // Assert
        let rounded = powers.map(|power| power.map(|db| (db * 10.0).round() / 10.0));
        assert_eq!(rounded, [Some(0.0), Some(-6.0), None]);
    }
}
