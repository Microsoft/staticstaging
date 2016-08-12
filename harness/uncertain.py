import math


class Uncertain(object):
    def __init__(self, value, error):
        self.value = value
        self.error = error

    def format(self, sep=' +/- '):
        """Format the number as a human-readable string.

        `sep` is the separator between the value and the error. If it is
        None, the error is not included.
        """
        if not self.error:
            return '{:g}'.format(self.value)

        position = math.log(self.error, 10)
        # Round away from zero.
        position = (math.ceil if position > 0.0 else math.floor)(position)
        position = abs(int(position)) if position < 0.0 else 1

        if sep:
            return '{value:.{position}f}{sep}{error:.{position}f}'.format(
                value=self.value, error=self.error,
                position=position,
                sep=sep,
            )
        else:
            return '{value:.{position}f}'.format(
                value=self.value,
                position=position,
            )

    def __str__(self):
        return self.format()

    def __repr__(self):
        return 'Uncertain({}, {})'.format(self.value, self.error)

    def __mul__(self, other):
        if isinstance(other, Uncertain):
            value = self.value * other.value
            return Uncertain(
                value,
                abs(value) * math.sqrt(
                    (self.error / self.value) ** 2 +
                    (other.error / other.value) ** 2
                )
            )
        else:
            return Uncertain(self.value * other, abs(self.error * other))

    def __rmul__(self, other):
        return self * other

    def __truediv__(self, other):
        return self * other ** -1.0

    def __rtruediv__(self, other):
        return other * self ** -1.0

    def __pow__(self, other):
        if isinstance(other, Uncertain):
            raise NotImplementedError()
        else:
            value = self.value ** other
            return Uncertain(
                value,
                abs(value) * abs(other) * self.error / abs(self.value)
            )

    def __add__(self, other):
        if isinstance(other, Uncertain):
            return Uncertain(
                self.value + other.value,
                math.sqrt(
                    self.error ** 2 +
                    other.error ** 2
                )
            )
        else:
            return Uncertain(self.value + other, self.error)

    def __sub__(self, other):
        return self + (-other)

    def __neg__(self):
        return self * -1.0

    def __gt__(self, other):
        if isinstance(other, Uncertain):
            return self.value - self.error > other.value + other.error
        else:
            return self.value - self.error > other

    def __lt__(self, other):
        return -self > -other


def umean(nums):
    """Given a list of numbers, return their mean with standard error as
    an Uncertain.
    """
    mean = sum(nums) / len(nums)
    stdev = math.sqrt(sum((x - mean) ** 2 for x in nums) / (len(nums) - 1.0))
    stderr = stdev / math.sqrt(len(nums))
    return Uncertain(mean, stderr)
