//! The bits of a message, numbered from 1 as ICAO Annex 10 and RTCA DO-260B number them.

/// Some bits in a row: a message, or a field of one.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Bits {
    bits: u128,
    len: u32,
}

impl Bits {
    #[must_use]
    pub fn of(bytes: &[u8]) -> Self {
        Self {
            bits: bytes
                .iter()
                .fold(0, |bits, &byte| bits << 8 | u128::from(byte)),
            len: bytes.iter().map(|_| 8).sum(),
        }
    }

    /// The bits as bytes, what they leave of the last ones filled with zeros.
    #[must_use]
    pub fn bytes<const N: usize>(self) -> [u8; N] {
        let mut bytes = [0; N];
        if self.len > 0 {
            let from_the_top = (self.bits << (u128::BITS - self.len)).to_be_bytes();
            bytes.copy_from_slice(&from_the_top[..N]);
        }
        bytes
    }

    pub(crate) fn len(self) -> u32 {
        self.len
    }

    /// Bits `first` to `last` as a field of their own.
    pub(crate) fn field(self, first: u32, last: u32) -> Self {
        let len = last - first + 1;
        Self {
            bits: self.bits >> (self.len - last) & ((1 << len) - 1),
            len,
        }
    }

    /// Bits `first` to `last` as a number; they are 32 at most.
    #[allow(clippy::cast_possible_truncation)]
    pub(crate) fn get(self, first: u32, last: u32) -> u32 {
        self.field(first, last).bits as u32
    }

    pub(crate) fn flag(self, bit: u32) -> bool {
        self.get(bit, bit) == 1
    }

    /// These bits and then the low `width` ones of the value.
    pub(crate) fn put(self, value: u32, width: u32) -> Self {
        Self {
            bits: self.bits << width | u128::from(value) & ((1 << width) - 1),
            len: self.len + width,
        }
    }

    pub(crate) fn put_flag(self, set: bool) -> Self {
        self.put(u32::from(set), 1)
    }

    /// These bits and then the others.
    pub(crate) fn then(self, others: Self) -> Self {
        Self {
            bits: self.bits << others.len | others.bits,
            len: self.len + others.len,
        }
    }

    /// These bits and then zeros, to `len` bits in all.
    pub(crate) fn filled(self, len: u32) -> Self {
        Self {
            bits: self.bits << (len - self.len),
            len,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Bits;

    #[test]
    fn bits_are_numbered_from_the_first_of_the_first_byte() {
        // Arrange
        let bits = Bits::of(&[0b1000_0001, 0b0100_0010]);

        // Act
        let read = (
            bits.flag(1),
            bits.flag(2),
            bits.get(8, 10),
            bits.field(9, 16),
        );

        // Assert
        assert_eq!(read, (true, false, 0b101, Bits::of(&[0b0100_0010])));
    }

    #[test]
    fn bits_are_put_one_after_the_other() {
        // Arrange
        let first = Bits::default().put(0b101, 3).put_flag(true);

        // Act
        let bits = first.then(Bits::of(&[0xff])).put(0x1ff, 2);

        // Assert: only the low bits of what does not fit its width are put
        assert_eq!(bits, Bits::default().put(0b10_1111_1111_1111, 14));
    }

    #[test]
    fn bytes_fill_what_the_bits_leave_with_zeros() {
        // Arrange
        let bits = Bits::default().put(0b10_0000_0011, 10);

        // Act
        let bytes = [
            bits.bytes::<2>(),
            bits.filled(16).bytes::<2>(),
            Bits::default().bytes::<2>(),
        ];

        // Assert
        assert_eq!(
            bytes,
            [
                [0b1000_0000, 0b1100_0000],
                [0b1000_0000, 0b1100_0000],
                [0, 0]
            ]
        );
    }
}
