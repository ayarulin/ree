# frozen_string_literal: true

class ReeMapper::ErrorWithLocation < ReeMapper::Error
  attr_reader :location

  def initialize(message, location = nil)
    if message.is_a?(String) && location && ENV["RUBY_ENV"] == "test"
      message = "#{message}, located at #{location}"
    end

    super(message)
    @location = location
  end

  def full_message(...)
    msg = super
    return msg if location.nil?

    idx = msg.index(/\).*\n/)
    return msg if idx.nil?
    return msg if ENV["RUBY_ENV"] == "test"

    msg.insert(idx + 1, ", located at #{location}")
  end
end
