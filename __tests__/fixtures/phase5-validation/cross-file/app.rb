require_relative 'user'

class App
  def run
    user = User.new("Alice")
    puts user.name
  end
end
